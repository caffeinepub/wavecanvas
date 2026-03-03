import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Snapshot {
    id: bigint;
    name: string;
    engineStateJson: string;
    timestamp: bigint;
}
export interface Preset {
    paramsJson: string;
    mode: string;
    name: string;
}
export interface Pattern {
    bpm: number;
    name: string;
    stepDataJson: string;
    swing: number;
}
export interface backendInterface {
    deletePattern(name: string): Promise<void>;
    deletePreset(name: string): Promise<void>;
    deleteSnapshot(id: bigint): Promise<void>;
    getAllPatterns(): Promise<Array<Pattern>>;
    getAllPresetsByMode(mode: string): Promise<Array<Preset>>;
    getAllSnapshots(): Promise<Array<Snapshot>>;
    getPattern(name: string): Promise<Pattern>;
    getPreset(name: string): Promise<Preset>;
    getSnapshot(id: bigint): Promise<Snapshot>;
    savePattern(name: string, stepDataJson: string, bpm: number, swing: number): Promise<void>;
    savePreset(name: string, mode: string, paramsJson: string): Promise<void>;
    saveSnapshot(name: string, stateJson: string, timestamp: bigint): Promise<bigint>;
    updateSnapshot(id: bigint, newStateJson: string, newTimestamp: bigint): Promise<void>;
}
