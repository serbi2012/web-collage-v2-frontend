import React from "react";
import { useState } from "react";
import SIDEBAR_TOOLS from "../../constants/SIDEBAR_TOOLS";
import SidebarBoxModeModal from "../SidebarBoxModeModal";
import SidebarDrawingModeModal from "../SidebarDrawingModeModal";
import SidebarFoldButton from "../SidebarFoldButton";
import SidebarSaveModeModal from "../SidebarSaveModeModal";
import SidebarSelectModeModal from "../SidebarSelectModeModal";
import SidebarShareModeModal from "../SidebarShareModeModal";
import SidebarThemeModeModal from "../SidebarThemeModeModal";
import SidebarTool from "../SidebarTool";
import { S } from "./style";

const Sidebar = () => {
    const [isFold, setIsFold] = useState(false);

    return (
        <S.MainWrapper
            id="sidebar"
            style={{
                transform: isFold ? ["translateX(-100px)"] : ["translateX(0px)"],
            }}
        >
            <SidebarSelectModeModal />
            <SidebarBoxModeModal />
            <SidebarDrawingModeModal />
            <SidebarSaveModeModal />
            <SidebarThemeModeModal />
            <SidebarShareModeModal />
            {SIDEBAR_TOOLS?.map((value, index) => {
                return <SidebarTool icon={value?.ICON} mode={value?.MODE} key={index} />;
            })}
            <SidebarFoldButton isFold={isFold} setIsFold={setIsFold} />
        </S.MainWrapper>
    );
};

export default Sidebar;
