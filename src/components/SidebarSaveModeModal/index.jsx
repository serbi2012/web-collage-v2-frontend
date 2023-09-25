import React from "react";
import ReactToPrint from "react-to-print";
import { S } from "./style";
import { isSidebarModalOpenState, selectedSidebarToolState } from "../../recoil/atoms";
import { useRecoilState } from "recoil";

const SidebarSaveModeModal = () => {
    const [selectedSidebarTool] = useRecoilState(selectedSidebarToolState);
    const [isSidebarModalOpen] = useRecoilState(isSidebarModalOpenState);

    return (
        <S.MainWrapper
            style={{
                display: (selectedSidebarTool !== "saveMode" || !isSidebarModalOpen) && "none",
            }}
        >
            <h3>Save Mode</h3>
            <ReactToPrint
                trigger={() => <S.SidebarModeOption>Save Scrap Window</S.SidebarModeOption>}
                content={() => document.getElementById("scrapWindowContentBox")}
            />
        </S.MainWrapper>
    );
};

export default SidebarSaveModeModal;
