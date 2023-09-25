import React from "react";
import { S } from "./style";
import { selectedElementState } from "../../recoil/atoms";
import { useRecoilState } from "recoil";

const SortBoxOption = ({ alignItems, flexDirection, rotate, sortDirection }) => {
    const [selectedElement] = useRecoilState(selectedElementState);

    const sortBoxOnClick = () => {
        selectedElement.style.display = "flex";
        selectedElement.style.justifyContent = "center";
        selectedElement.style.alignItems = alignItems;
        selectedElement.style.flexDirection = flexDirection;
    };

    return (
        <S.MainWrapper onClick={sortBoxOnClick}>
            <div data-testid="sortBoxOption" className={`${sortDirection} ${rotate && "rotate"}`}>
                <S.BigFigure />
                <S.SmallFigure />
            </div>
        </S.MainWrapper>
    );
};

export default SortBoxOption;
