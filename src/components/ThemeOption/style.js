import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        margin: 5px;
        height: 50px;
        width: 50px;
        border: 2px solid ${COLORS.MAIN_COLOR};
        border-radius: 5px;
        user-select: none;
        cursor: pointer;
    `,
};
