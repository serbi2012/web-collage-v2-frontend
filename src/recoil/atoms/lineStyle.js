import { atom } from "recoil";

export const lineColorState = atom({
    key: "lineColorState",
    default: "black",
});

export const lineWidthState = atom({
    key: "lineWidthState",
    default: 3,
});

export const lineOpacityState = atom({
    key: "lineOpacityState",
    default: 20,
});
