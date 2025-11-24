import { promises as fs } from "fs"
import { CucumberData, Result } from "./types"

export async function readCucumberResults(): Promise<Result<CucumberData[]>> {
    const resultFile = "../output/cucumber-report.json"
    try {
        const file = await fs.readFile(resultFile, "utf8")
        const result = JSON.parse(file)
        return { success: "succeeded", data: result }
    } catch (e) {
        return { success: "failed", reason: `Failed to read ${resultFile}: ${e}` }
    }
}

export async function getFeatureFile(test: CucumberData): Promise<Result<string>> {
    const fullPath = `../${test.uri}`
    try {
        const file = await fs.readFile(fullPath, "utf8")
        return { success: "succeeded", data: file }
    } catch (e) {
        return { success: "failed", reason: `Failed to read ${fullPath}: ${e}` }
    }
}
