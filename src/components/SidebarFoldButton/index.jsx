import React from "react";
import { S } from "./style";

const SidebarFoldButton = ({ isFold, setIsFold }) => {
    return (
        <S.MainWrapper
            data-testid="sidebarFoldButton"
            isFold={isFold}
            onClick={() => {
                setIsFold(!isFold);
            }}
        >
            <span className="material-symbols-outlined">logout</span>
        </S.MainWrapper>
    );
};

export default SidebarFoldButton;
