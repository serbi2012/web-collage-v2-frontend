import React from "react";
import { S } from "./style";
import { useRecoilState } from "recoil";
import { isSidebarModalOpenState, selectedSidebarToolState } from "../../recoil/atoms";

const SidebarTool = ({ icon, mode }) => {
    const [selectedSidebarTool, setSelectSidebarTool] = useRecoilState(selectedSidebarToolState);
    const [isSidebarModalOpen, setIsSidebarModalOpen] = useRecoilState(isSidebarModalOpenState);

    const changeSidebarToolOnClick = () => {
        setSelectSidebarTool(mode);

        selectedSidebarTool === mode ? setIsSidebarModalOpen(!isSidebarModalOpen) : setIsSidebarModalOpen(true);
    };

    return (
        <S.MainWrapper className={selectedSidebarTool === mode && "selectedTool"} onClick={changeSidebarToolOnClick}>
            <span className="material-symbols-outlined">{icon}</span>
        </S.MainWrapper>
    );
};

export default SidebarTool;
