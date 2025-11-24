import { Item, Project, createConsoleAPI } from "matrix-requirements-sdk/server"
import { getFeatureFile, readCucumberResults } from "./cucumber"
import { CucumberData } from "./types"
import { RichtextFieldHandler, SteplistFieldHandler } from "matrix-requirements-sdk/server"
import { SERVER, PROJECT_KEY, getAtcIdFromTest } from "./utilities"

async function updateDescription(item: Item, test: CucumberData) {
    const field = item.getSingleFieldByName("Description")
    const feature = await getFeatureFile(test)
    if (feature.success === "failed") {
        throw `Unable to load feature file: ${feature.reason}`
    }
    console.log(
        `updateDescription: loaded feature file for "${test.name}" from "${test.uri}", length=${feature.data.length}`,
    )
    // console.log("Feature", feature.data)
    const description = field.getHandler<RichtextFieldHandler>()
    // console.log("Previous value", description.getHtml())
    description.setHtml(`<pre>${feature.data}</pre>`)
    // console.log("New value", description.getHtml())
}

async function updateTestTable(item: Item, test: CucumberData) {
    const steps = item.getSingleFieldByName("Steps").getHandler<SteplistFieldHandler>()
    console.log(
        `updateTestTable: "${test.name}" has ${test.elements.length} scenario(s), existing rows=${steps.getRowCount()}`,
    )
    for (let it = 0; it < test.elements.length; it++) {
        const scenario = test.elements[it]
        if (it < steps.getRowCount()) {
            steps.setColumnData(it, "Action", scenario.name)
        } else {
            steps.insertRow(it, ["", scenario.name, ""])
        }
    }
}

async function updateATCs(search: Item[], data: CucumberData[], VALID: Project) {
    console.log(
        `updateATCs: starting, ${data.length} test(s) to process, ${search.length} ATC item(s) available in Matrix`,
    )
    for (const test of data) {
        const id = getAtcIdFromTest(test)
        console.log(`updateATCs: id=${id}`)
        if (id === null) {
            console.log(`updateATCs: skipping test "${test.name}" (uri="${test.uri}") – no ATC ID found in name or uri`)
            continue
        }
        console.log(`updateATCs: processing test "${test.name}" -> item ${id}`)
        try {
            // console.log("GET ITEM", id)
            const item = await VALID.getItem(id)
            console.log(`updateATCs: loaded item ${id}`)

            await updateDescription(item, test)
            await updateTestTable(item, test)

            if (item.needsSave()) {
                console.log(`updateATCs: updating item ${id} in Matrix`)
                await VALID.updateItem(item)
            } else {
                console.log(`updateATCs: item ${id} has no changes, skipping update`)
            }
        } catch (e) {
            console.log(`updateATCs: ERROR on item ${id}: ${e}`, JSON.stringify(e, null, 2))
        }
        // search.find(item => test.name)
    }
}

async function publishTests(): Promise<boolean> {
    if (process.env.API_TOKEN == null || process.env.API_TOKEN == "") {
        console.log("You have to set the API Token in the API_TOKEN env variable")
        throw "API Token not provided"
    }
    try {
        console.log("publishTests: starting, reading cucumber results...")
        const results = await readCucumberResults()
        if (results.success === "failed") {
            console.log("publishTests: failed to read cucumber results:", results.reason)
            return false
        }
        console.log(`publishTests: loaded cucumber results for ${results.data.length} feature(s)`)

        console.log(`publishTests: creating SDK client for ${SERVER}`)
        const sdk = await createConsoleAPI({
            token: `Token ${process.env.API_TOKEN}`,
            url: SERVER,
        })
        sdk.setComment("Update ATCs")
        console.log(`publishTests: opening project ${PROJECT_KEY}`)
        const project = await sdk.openProject(PROJECT_KEY)
        if (project == null) {
            console.error(`publishTests: unable to open project ${PROJECT_KEY}`)
            return false
        }
        const searchOptions = {
            includeFields: true,
            includeLabels: true,
            includeDownlinks: true,
            includeUplinks: false,
        }
        const mrql = `mrql:category=ATC`
        console.log(`publishTests: searching for ATC items with MRQL "${mrql}"`)
        const search = await project.searchForItems(mrql, "", false, project.constructSearchFieldMask(searchOptions))

        console.log(`publishTests: found ${search.length} ATC item(s) in Matrix`)
        await updateATCs(search, results.data, project)
    } catch (error) {
        console.log("publishTests: ERROR", error)
        return false
    }
    return true
}

publishTests().then((success: boolean) => {
    if (success) {
        console.log("Publish of tests completed")
    } else {
        process.exit(-1)
    }
})
