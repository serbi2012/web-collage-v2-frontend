import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        width: 70px;
        height: 100vh;
        background-color: ${COLORS.MAIN_COLOR};
        transition: all 0.3s ease-in-out;
        z-index: 200000;

        .selectedTool {
            color: ${COLORS.MAIN_COLOR};
            background-color: ${COLORS.SUB_COLOR};
        }
    `,
};
