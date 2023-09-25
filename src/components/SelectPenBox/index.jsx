import React from "react";
import { S } from "./style";
import { sidebarModeOptionState } from "../../recoil/atoms";
import { useRecoilState } from "recoil";

const SelectPenBox = ({ mode, selectedMode, setSelectedMode }) => {
    const [, setSidebarModeOption] = useRecoilState(sidebarModeOptionState);

    return (
        <S.MainWrapper
            className={`${selectedMode === mode && "selected"}`}
            onClick={() => {
                setSidebarModeOption(mode);
                setSelectedMode(mode);
            }}
        >
            {mode}
        </S.MainWrapper>
    );
};

export default SelectPenBox;
