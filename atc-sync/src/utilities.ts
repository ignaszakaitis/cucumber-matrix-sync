import * as dotenv from "dotenv"

dotenv.config()

import { CucumberData, CucumberElement } from "./types"

export const SERVER = process.env.MATRIX_SERVER ?? "https://matrixspecs.matrixreq.com"
export const PROJECT_KEY = process.env.MATRIX_PROJECT ?? "VALID_NEXTGEN"

export function getScenarioStatus(scenario: CucumberElement): string {
    const visibleSteps = scenario.steps.filter((step) => !step.hidden)
    if (visibleSteps.length === 0) {
        return "no steps"
    }
    if (visibleSteps.some((s) => s.result.status === "failed")) {
        return "failed"
    }
    if (visibleSteps.every((s) => s.result.status === "passed")) {
        return "passed"
    }
    return "mixed"
}

export function getScenarioDurationSeconds(scenario: CucumberElement): number {
    const totalNs = scenario.steps.reduce((sum, step) => sum + (step.result?.duration ?? 0), 0)
    // cucumber duration is typically in nanoseconds
    return totalNs / 1_000_000_000
}

export function getFirstFailedStepName(scenario: CucumberElement): string | null {
    const visibleSteps = scenario.steps.filter((step) => !step.hidden)
    const failed = visibleSteps.find((s) => s.result.status === "failed")
    return failed ? failed.name : null
}

export function getAtcIdFromTest(test: CucumberData): string | null {
    const regex = /(ATC-\d+)/
    const fromName = regex.exec(test.name)
    if (fromName != null && fromName.length > 1) {
        return fromName[1]
    }
    const fromUri = test.uri ? regex.exec(test.uri) : null
    if (fromUri != null && fromUri.length > 1) {
        return fromUri[1]
    }
    return null
}
