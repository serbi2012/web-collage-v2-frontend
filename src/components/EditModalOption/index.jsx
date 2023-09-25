import React from "react";
import { S } from "./style";

const EditModalOption = ({ option, icon }) => {
    return (
        <S.MainWrapper>
            <span
                className="material-symbols-outlined"
                onMouseDown={() => {
                    document.execCommand(option);
                }}
            >
                {icon}
            </span>
        </S.MainWrapper>
    );
};

export default EditModalOption;
