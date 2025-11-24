import {
    createConsoleAPI,
    Item,
    Project,
    RichtextFieldHandler,
    SteplistFieldHandler,
} from "matrix-requirements-sdk/server"
import { promises as fs } from "fs"
import axios from "axios"
import { CucumberData } from "./types"
import { readCucumberResults } from "./cucumber"
import {
    SERVER,
    PROJECT_KEY,
    getScenarioStatus,
    getScenarioDurationSeconds,
    getFirstFailedStepName,
    getAtcIdFromTest,
} from "./utilities"
const XTC_FOLDER_REF = process.env.XTC_FOLDER_REF
const XTC_CONTENTS_FIELD_NAME = process.env.XTC_CONTENTS_FIELD_NAME ?? "Contents"
const XTC_STEPS_FIELD_NAME = process.env.XTC_STEPS_FIELD_NAME ?? "Test Case Steps"
const STEPS_COMMENT_COLUMN = process.env.STEPS_COMMENT_COLUMN

async function findXtcItems(project: Project): Promise<Item[]> {
    if (!XTC_FOLDER_REF) {
        throw new Error("XTC_FOLDER_REF environment variable must be set (e.g. F-XTC-1013)")
    }
    const searchOptions = {
        includeFields: false,
        includeLabels: false,
        includeDownlinks: false,
        includeUplinks: false,
    }
    const mrql = `mrql:folderm=${XTC_FOLDER_REF}`
    const items = await project.searchForItems(mrql, "", false, project.constructSearchFieldMask(searchOptions))
    return items
}

async function uploadHtmlReport(project: Project): Promise<string> {
    const reportPath = "../output/cucumber-report.html"
    const exists = await fs
        .access(reportPath)
        .then(() => true)
        .catch(() => false)
    if (!exists) {
        throw new Error(`HTML report not found at ${reportPath}`)
    }

    const stream = (await import("fs")).createReadStream(reportPath)
    const result = await project.uploadLocalFile(axios, stream, () => {
        // minimal progress handler
    })
    const url = project.computeFileUrl(result)
    return url
}

async function updateFolderContents(folder: Item, reportUrl: string) {
    const field = folder.getSingleFieldByName(XTC_CONTENTS_FIELD_NAME).getHandler<RichtextFieldHandler>()
    const html = `<p>Latest execution report: <a href="${reportUrl}" target="_blank">Open HTML report</a></p>`
    field.setHtml(html)
}

async function updateXtcStepsComments(item: Item, test: CucumberData) {
    if (!STEPS_COMMENT_COLUMN) {
        return
    }
    const steps = item.getSingleFieldByName(XTC_STEPS_FIELD_NAME).getHandler<SteplistFieldHandler>()
    for (let it = 0; it < test.elements.length; it++) {
        const scenario = test.elements[it]
        const status = getScenarioStatus(scenario)
        const durationSeconds = getScenarioDurationSeconds(scenario)
        const failedStepName = status === "failed" ? getFirstFailedStepName(scenario) : null
        const details = status === "failed" && failedStepName ? ` – failing step: "${failedStepName}"` : ""
        const commentText = `<p>${status} (${durationSeconds.toFixed(2)}s)${details}</p>`
        if (it < steps.getRowCount()) {
            steps.setColumnData(it, STEPS_COMMENT_COLUMN, commentText)
        }
    }
}

async function publishXtcExecution(): Promise<boolean> {
    if (process.env.API_TOKEN == null || process.env.API_TOKEN === "") {
        console.log("You have to set the API Token in the API_TOKEN env variable")
        throw "API Token not provided"
    }
    try {
        console.log("xtcReporter: reading cucumber results...")
        const results = await readCucumberResults()
        if (results.success === "failed") {
            console.log("xtcReporter: failed to read cucumber results:", results.reason)
            return false
        }
        const tests = results.data
        const testsByAtcId = new Map<string, CucumberData>()
        for (const t of tests) {
            const atcId = getAtcIdFromTest(t)
            if (atcId) {
                testsByAtcId.set(atcId, t)
            }
        }

        console.log(`xtcReporter: creating SDK client for ${SERVER}`)
        const sdk = await createConsoleAPI({
            token: `Token ${process.env.API_TOKEN}`,
            url: SERVER,
        })
        sdk.setComment("Update XTC execution from cucumber-report")

        console.log(`xtcReporter: opening project ${PROJECT_KEY}`)
        const project = await sdk.openProject(PROJECT_KEY)
        if (!project) {
            console.error(`xtcReporter: unable to open project ${PROJECT_KEY}`)
            return false
        }

        console.log(`xtcReporter: loading XTC folder item ${XTC_FOLDER_REF}, contents field=${XTC_CONTENTS_FIELD_NAME}`)
        const folderItem = await project.getItem(XTC_FOLDER_REF as string)

        console.log("xtcReporter: uploading HTML report")
        const reportUrl = await uploadHtmlReport(project)
        console.log(`xtcReporter: updating folder ${XTC_FOLDER_REF} contents with HTML report URL`)
        await updateFolderContents(folderItem, reportUrl)

        console.log(
            `xtcReporter: searching for XTC items in folder ${XTC_FOLDER_REF}, steps field=${XTC_STEPS_FIELD_NAME}, comment column=${STEPS_COMMENT_COLUMN}`,
        )
        const xtcItems = await findXtcItems(project)
        if (xtcItems.length === 0) {
            console.error(`xtcReporter: no XTC items found in folder ${XTC_FOLDER_REF}`)
            return false
        }

        for (const item of xtcItems) {
            const title = (item as any).getTitle ? (item as any).getTitle() : item.getId()
            const atcMatch = /(ATC-\d+)/.exec(title)
            const atcId = atcMatch && atcMatch[1]
            if (!atcId) {
                console.log(`xtcReporter: skipping XTC item ${item.getId()} – no ATC id found in title "${title}"`)
                continue
            }
            const testForAtc = testsByAtcId.get(atcId)
            if (!testForAtc) {
                console.log(
                    `xtcReporter: skipping XTC item ${item.getId()} – no execution found in cucumber report for ${atcId}`,
                )
                continue
            }

            console.log(`xtcReporter: updating XTC item ${item.getId()} for ${atcId} steps comments`)
            await updateXtcStepsComments(item, testForAtc)

            if (item.needsSave()) {
                await project.updateItem(item)
                console.log(`xtcReporter: updated XTC item ${item.getId()}`)
            } else {
                console.log(`xtcReporter: no changes detected for XTC item ${item.getId()}`)
            }
        }

        if (folderItem.needsSave()) {
            await project.updateItem(folderItem)
            console.log(`xtcReporter: updated folder item ${XTC_FOLDER_REF}`)
        }
    } catch (error) {
        console.log("xtcReporter: ERROR", error)
        return false
    }
    return true
}

publishXtcExecution().then((success: boolean) => {
    if (success) {
        console.log("XTC execution publish completed")
    } else {
        process.exit(-1)
    }
})
