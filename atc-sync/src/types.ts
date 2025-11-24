type SuccessResult<T> = {
    success: "succeeded";
    data: T;
};
type FailResult = {
    success: "failed";
    reason: string;
};
export type Result<T> = SuccessResult<T> | FailResult;

export type CucumberData = {
    description: string;
    elements: CucumberElement[];
    id: string;
    line: number;
    keyword: string;
    name: string;
    tags: string[];
    uri: string;
};

export type CucumberElement = {
    description: string;
    id: string;
    keyword: string;
    line: number;
    name: string;
    steps: CucumberStep[];
    tags: string[];
    type: string;
};

export type CucumberStep = {
    arguments: CucumberArgument[];
    keyword: string;
    line: number;
    name: string;
    match: CucumberMatch;
    result: CucumberResult;
    hidden: boolean | undefined
};

export type CucumberArgument = {};

export type CucumberMatch = {
    location: string;
};

export type CucumberResult = {
    status: string;
    duration: number;
};
