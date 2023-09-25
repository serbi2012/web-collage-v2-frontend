import React, { useState } from "react";
import { S } from "./style";
import { isSidebarModalOpenState, selectedSidebarToolState, sidebarModeOptionState } from "../../recoil/atoms";
import { useRecoilState } from "recoil";

const SidebarSelectModeModal = () => {
    const [selectedSidebarTool] = useRecoilState(selectedSidebarToolState);
    const [isSidebarModalOpen] = useRecoilState(isSidebarModalOpenState);
    const [, setSidebarModeOption] = useRecoilState(sidebarModeOptionState);

    const [selectedMode, setSelectedMode] = useState(null);

    const changeSelectModeOnClick = (mode) => {
        setSidebarModeOption(`${mode}Mode`);
        setSelectedMode(mode);
    };

    return (
        <S.MainWrapper
            style={{
                display: (selectedSidebarTool !== "selectMode" || !isSidebarModalOpen) && "none",
            }}
        >
            <h3>Select Mode</h3>
            <S.SidebarModeOption
                className={`${selectedMode === "BoxAndBlock" && "selected"}`}
                onClick={() => {
                    changeSelectModeOnClick("BoxAndBlock");
                }}
            >
                Box & Block
            </S.SidebarModeOption>
            <S.SidebarModeOption
                className={`${selectedMode === "FreePosition" && "selected"}`}
                onClick={() => {
                    changeSelectModeOnClick("FreePosition");
                }}
            >
                Free Position
            </S.SidebarModeOption>
        </S.MainWrapper>
    );
};

export default SidebarSelectModeModal;
