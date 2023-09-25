import { atom } from "recoil";

export const selectedSidebarToolState = atom({
    key: "selectedSidebarToolState",
    default: "",
});

export const isSidebarModalOpenState = atom({
    key: "isSidebarModalOpenState",
    default: false,
});
