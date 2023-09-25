import styled from "styled-components";
import COLORS from "../../constants/COLORS";
import THEME from "../../constants/THEME";

export const S = {
    MainWrapper: styled.div`
        display: flex;
        width: calc((100vw - 70px) / 2);
        height: 100vh;
        border-radius: 3px;

        .theme-dark {
            color: ${THEME.DARK.FONT_COLOR} !important;
            background-color: ${THEME.DARK.BACKGROUND_COLOR}!important;
        }

        .theme-blue {
            color: ${THEME.BLUE.FONT_COLOR} !important;
            background-color: ${THEME.BLUE.BACKGROUND_COLOR} !important;
        }

        .theme-brown {
            color: ${THEME.BROWN.FONT_COLOR} !important;
            background-color: ${THEME.BROWN.BACKGROUND_COLOR} !important;
        }

        .theme-skyblue {
            color: ${THEME.SKY_BLUE.FONT_COLOR} !important;
            background-color: ${THEME.SKY_BLUE.BACKGROUND_COLOR} !important;
        }

        .theme-green {
            color: ${THEME.GREEN.FONT_COLOR} !important;
            background-color: ${THEME.GREEN.BACKGROUND_COLOR} !important;
        }

        .selected-dom {
            box-shadow: 0 0 0 2px #ff676775 !important;
            border-radius: 2px;
        }
    `,
    BoxContainer: styled.div`
        display: flex;
        justify-content: flex-start;
        align-items: center;
        flex-direction: column;
        margin: 5px 0;
        padding: 10px;
        width: 500px;
        box-shadow: 0 0 0 2px #ccc;
    `,
    ContentBox: styled.div`
        display: flex;
        justify-content: flex-start;
        align-items: center;
        flex-direction: column;
        padding: 100px;
        width: 100%;
        overflow-y: scroll;
    `,
    ResizeLine: styled.div`
        height: 100%;
        width: 5px;
        background: ${COLORS.MAIN_COLOR};
        cursor: col-resize;
    `,
    FullscreenButton: styled.div`
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        bottom: 10px;
        left: 83px;
        user-select: none;
        cursor: pointer;

        span {
            font-size: 30px;
            transition: all 0.4s ease-in-out;

            :hover {
                font-size: 35px;
            }
        }
    `,
};
