import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        height: 100vh;
        width: calc((100vw - 70px) / 2);
        overflow-y: scroll;
        user-select: none;

        .scrapMode {
            color: ${COLORS.SUB_COLOR};
            background-color: ${COLORS.MAIN_COLOR};
            user-select: none;
            cursor: pointer;
        }

        .selected-dom {
            box-shadow: 0 0 0 2px #ff676775;
            border-radius: 2px;
        }
    `,
    WebContainer: styled.div`
        height: 100%;
        width: 100%;
        overflow-y: scroll;
    `,
    RatioButton: styled.div`
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        right: 15px;
        bottom: 10px;
        width: 130px;
        height: 40px;
        background-color: ${COLORS.SUB_COLOR};
        border-radius: 10px;
        box-shadow: 1px 2px 3px 0px rgba(0, 0, 0, 0.2);
        z-index: 2000000;

        span {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 20px;
        }

        div {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 40px;
        }
    `,
    ScrapModeButton: styled.div`
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        bottom: 15px;
        right: 15px;
        height: 35px;
        width: 35px;
        background-color: ${COLORS.SUB_COLOR};
        border-radius: 5px;
        box-shadow: 1px 2px 3px 0px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease-in-out;
        user-select: none;
        cursor: pointer;
        z-index: 2000000;

        :hover {
            color: ${COLORS.SUB_COLOR};
            background-color: ${COLORS.MAIN_COLOR};
            opacity: 0.7;
        }

        :active {
            color: ${COLORS.SUB_COLOR};
            background-color: ${COLORS.MAIN_COLOR};
            opacity: 0.5;
        }
    `,
};
