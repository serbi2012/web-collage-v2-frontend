import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        padding: 20px 30px;
        top: 17vh;
        left: 90px;
        min-width: 250px;
        background-color: ${COLORS.SUB_COLOR};
        border: 2px solid ${COLORS.MAIN_COLOR};
        border-radius: 5px;

        .selected {
            color: ${COLORS.SUB_COLOR};
            background-color: ${COLORS.MAIN_COLOR};
        }
    `,
    SidebarModeOption: styled.div`
        margin: 5px 0px;
        padding: 3px 10px;
        text-align: center;
        background-color: ${COLORS.SUB_COLOR};
        border: 1px solid ${COLORS.MAIN_COLOR};
        border-radius: 5px;
        transition: all 0.2s ease-in-out;
        user-select: none;
        cursor: pointer;

        :hover {
            color: ${COLORS.SUB_COLOR};
            background-color: ${COLORS.MAIN_COLOR};
        }

        :active {
            opacity: 0.4;
        }
    `,
};
