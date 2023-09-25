import React, { useCallback, useEffect, useState } from "react";
import SORT_BOX_OPTION from "../../constants/SORT_BOX_OPTION";
import SortBoxOption from "../SortBoxOption";
import { useRecoilState } from "recoil";
import { isSidebarModalOpenState, selectedElementState, selectedSidebarToolState } from "../../recoil/atoms";
import { S } from "./style";

const BOX_SHADOW = "0 0 0 2px #ccc";
const BOX_NO_SHADOW = "none";
const BOX_COMPONENT_CLASS_NAME = "BoxComponent";

const SidebarBoxModeModal = () => {
    const [selectedSidebarTool] = useRecoilState(selectedSidebarToolState);
    const [isSidebarModalOpen] = useRecoilState(isSidebarModalOpenState);
    const [selectedElement, setSelectedElement] = useRecoilState(selectedElementState);

    const [isBoxBorder, setIsBoxBorder] = useState(true);

    const addBoxOnClick = useCallback(() => {
        const box = document.createElement("div");
        const scrapWindow = document.getElementById("scrapWindowContentBox");

        box.style = {
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            flexDirection: "column",
            margin: "5px 0",
            padding: "10px",
            width: "500px",
            boxShadow: BOX_SHADOW,
        };

        box.classList.add(BOX_COMPONENT_CLASS_NAME);
        scrapWindow.insertAdjacentElement("beforeend", box);
    }, []);

    const toggleBoxBorderOnClick = useCallback(() => {
        const boxShadowValue = isBoxBorder ? BOX_NO_SHADOW : BOX_SHADOW;
        const boxes = document.getElementsByClassName(BOX_COMPONENT_CLASS_NAME);
        Array.from(boxes).forEach((box) => (box.style.boxShadow = boxShadowValue));
        setIsBoxBorder(!isBoxBorder);
    }, [isBoxBorder]);

    useEffect(() => {
        const scrapWindow = document.getElementById("scrapWindowContentBox");

        const selectElementOnMousedown = (event) => {
            if (event.target !== scrapWindow) {
                setSelectedElement(event.target);
            }
        };

        const deleteElementOnKeydown = (event) => {
            if (selectedSidebarTool !== "boxMode") return;
            if (event.keyCode === 46 || event.keyCode === 8) {
                selectedElement.remove();
            }
        };

        scrapWindow.addEventListener("mousedown", selectElementOnMousedown);
        window.addEventListener("keydown", deleteElementOnKeydown);

        return () => {
            scrapWindow.removeEventListener("mousedown", selectElementOnMousedown);
            window.removeEventListener("keydown", deleteElementOnKeydown);
        };
    }, [selectedSidebarTool, selectedElement]);

    const isBoxMode = selectedSidebarTool !== "boxMode" || !isSidebarModalOpen;

    return (
        <S.MainWrapper
            style={{
                display: isBoxMode && "none",
            }}
        >
            <h3>Box Mode</h3>
            <S.SidebarModeOption onClick={addBoxOnClick}>Add Box</S.SidebarModeOption>
            <S.SidebarModeOption onClick={selectedElement.remove}>Delete Element</S.SidebarModeOption>
            <hr />
            <S.SidebarModeOption onClick={toggleBoxBorderOnClick}>Toggle Box Border</S.SidebarModeOption>
            <hr />
            <S.SortContainer>
                {SORT_BOX_OPTION?.map((value, index) => (
                    <SortBoxOption
                        alignItems={value.alignItems}
                        flexDirection={value.flexDirection}
                        rotate={value.rotate}
                        sortDirection={value.sortDirection}
                        key={index}
                    />
                ))}
            </S.SortContainer>
        </S.MainWrapper>
    );
};

export default SidebarBoxModeModal;
