import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        position: absolute;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 20px;
        top: 10px;
        left: 80px;
        height: 4rem;
        background-color: ${COLORS.MAIN_COLOR};
        border-radius: 5px;
        z-index: 200000;
        user-select: none;

        select {
            color: ${COLORS.SUB_COLOR};
            background-color: ${COLORS.MAIN_COLOR};
            border: none;

            :focus {
                outline: none;
            }
        }
    `,
    VerticalLine: styled.div`
        margin: 0 10px;
        height: 25px;
        width: 1px;
        background-color: ${COLORS.SUB_COLOR};
    `,
};
