import React, { useState } from "react";
import SelectPenBox from "../SelectPenBox";
import { S } from "./style";
import {
    isSidebarModalOpenState,
    lineColorState,
    lineOpacityState,
    lineWidthState,
    selectedSidebarToolState,
    sidebarModeOptionState,
} from "../../recoil/atoms";
import { useRecoilState } from "recoil";

const SidebarDrawingModeModal = () => {
    const [lineWidth, setLineWidth] = useRecoilState(lineWidthState);
    const [lineOpacity, setLineOpacity] = useRecoilState(lineOpacityState);
    const [, setLineColor] = useRecoilState(lineColorState);
    const [selectedSidebarTool] = useRecoilState(selectedSidebarToolState);
    const [isSidebarModalOpen] = useRecoilState(isSidebarModalOpenState);
    const [sidebarModeOption] = useRecoilState(sidebarModeOptionState);

    const [selectedMode, setSelectedMode] = useState(null);

    return (
        <S.MainWrapper
            id="drawingModeModal"
            style={{
                display: (selectedSidebarTool !== "drawingMode" || !isSidebarModalOpen) && "none",
            }}
        >
            <h3>Drawing Mode</h3>
            <S.SelectPenBox>
                {["Pen", "Highlighter", "Eraser"].map((value, index) => {
                    return (
                        <SelectPenBox
                            mode={value}
                            selectedMode={selectedMode}
                            setSelectedMode={setSelectedMode}
                            key={index}
                        />
                    );
                })}
            </S.SelectPenBox>
            <S.DrawingOptionBox>
                <S.DrawingOption>
                    <p>Width</p>
                    <input
                        type="range"
                        min="1"
                        max="50"
                        defaultValue="3"
                        onChange={(event) => {
                            setLineWidth(event.target.value);
                        }}
                    />
                    <div>{lineWidth}</div>
                </S.DrawingOption>
                <S.DrawingOption
                    style={{
                        display: sidebarModeOption !== "highlighter" && "none",
                    }}
                >
                    <p>Opacity</p>
                    <input
                        type="range"
                        min="10"
                        max="100"
                        defaultValue="10"
                        onChange={(event) => {
                            setLineOpacity(event.target.value);
                        }}
                    />
                    <div>{lineOpacity}</div>
                </S.DrawingOption>
                <S.DrawingOption
                    style={{
                        display: sidebarModeOption === "eraser" && "none",
                    }}
                >
                    <p>Color</p>
                    <input
                        type="color"
                        onChange={(event) => {
                            setLineColor(event.target.value);
                        }}
                    />
                </S.DrawingOption>
            </S.DrawingOptionBox>
        </S.MainWrapper>
    );
};

export default SidebarDrawingModeModal;
