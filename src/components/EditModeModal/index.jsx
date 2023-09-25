import React, { useState } from "react";
import EDIT_MODAL_OPTIONS from "../../constants/EDIT_MODAL_OPTIONS";
import EditModalOption from "../EditModalOption";
import { S } from "./style";
import { selectedSidebarToolState } from "../../recoil/atoms";
import { useRecoilState } from "recoil";

const FONT_TYPES = ["Monospace", "Arial", "Impact", "Georgia", "Verdana"];
const FONT_SIZES = ["10", "13", "16", "18", "24", "32", "48"];

const EditModal = () => {
    const [selectedSidebarTool] = useRecoilState(selectedSidebarToolState);

    const [fontSize] = useState(null);
    const [fontName, setFontName] = useState(null);

    const changeFontOption = (event, option) => {
        setFontName(event.target.value);
        document.execCommand(option, false, event.target.value);
    };

    return (
        <S.MainWrapper
            id="editModal"
            contentEditable={false}
            style={{
                display: selectedSidebarTool !== "editMode" && "none",
            }}
        >
            <select
                name="fontType"
                id="fontType"
                value={fontName}
                onChange={(event) => {
                    changeFontOption(event, "fontName");
                }}
            >
                {FONT_TYPES.map((font, idx) => (
                    <option key={idx} value={font}>
                        {font}
                    </option>
                ))}
            </select>

            <select
                name="fontSize"
                id="fontSize"
                value={fontSize}
                onChange={(event) => {
                    changeFontOption(event, "fontSize");
                }}
            >
                {FONT_SIZES.map((size, idx) => (
                    <option key={idx} value={idx + 1}>
                        {size}
                    </option>
                ))}
            </select>

            <S.VerticalLine />
            {EDIT_MODAL_OPTIONS.map((value, index) => {
                return <EditModalOption option={value.OPTION} icon={value.ICON} key={index} />;
            })}
        </S.MainWrapper>
    );
};

export default EditModal;
