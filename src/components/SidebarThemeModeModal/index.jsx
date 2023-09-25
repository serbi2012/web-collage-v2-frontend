import React, { useState } from "react";
import THEME from "../../constants/THEME";
import ThemeOption from "../ThemeOption";
import { S } from "./style";
import { useRecoilState } from "recoil";
import { isSidebarModalOpenState, selectedSidebarToolState } from "../../recoil/atoms";

const SidebarThemeModeModal = () => {
    const [selectedSidebarTool] = useRecoilState(selectedSidebarToolState);
    const [isSidebarModalOpen] = useRecoilState(isSidebarModalOpenState);

    const [scrapWindowWidth, setScrapWindowWidth] = useState(500);

    const reduceWidthMouseDown = () => {
        if (scrapWindowWidth > 300) {
            const boxes = document.getElementsByClassName("BoxComponent");

            for (let i = 0; i < boxes.length; i++) {
                boxes[i].style.width = `${scrapWindowWidth - 100}px`;
            }

            setScrapWindowWidth(scrapWindowWidth - 100);
        }
    };

    const increaseWidthMouseDown = () => {
        if (scrapWindowWidth < 1000) {
            const boxes = document.getElementsByClassName("BoxComponent");

            for (let i = 0; i < boxes.length; i++) {
                boxes[i].style.width = `${scrapWindowWidth + 100}px`;
            }

            setScrapWindowWidth(scrapWindowWidth + 100);
        }
    };

    return (
        <S.MainWrapper
            data-testid="sidebarThemeModeModal"
            style={{
                display: (selectedSidebarTool !== "themeMode" || !isSidebarModalOpen) && "none",
            }}
        >
            <h3>Theme Mode</h3>
            <h5>Width</h5>
            <S.ScrapWindowWidthBox>
                <S.SidebarModeOption data-testid="reduceWidth" onMouseDown={reduceWidthMouseDown}>
                    -
                </S.SidebarModeOption>
                {scrapWindowWidth}px
                <S.SidebarModeOption data-testid="increaseWidth" onMouseDown={increaseWidthMouseDown}>
                    +
                </S.SidebarModeOption>
            </S.ScrapWindowWidthBox>
            <hr />
            <h5>Theme</h5>
            <S.ThemeBox>
                {Object.values(THEME).map((value, index) => {
                    return <ThemeOption theme={value} key={index} />;
                })}
            </S.ThemeBox>
        </S.MainWrapper>
    );
};

export default SidebarThemeModeModal;
