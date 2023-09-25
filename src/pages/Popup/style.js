import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        top: 0px;
        bottom: 0px;
        left: 0px;
        right: 0px;
        text-align: center;
        height: 100%;
        padding: 10px;
        background-color: #27292d;
        color: white;

        & > hr {
            margin: 30px 0;
            width: 200px;
        }
    `,
    Header: styled.div`
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin: 20px 0;
        font-size: calc(10px + 2vmin);
        color: white;
    `,
    CollageButton: styled.div`
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100px;
        width: 100px;
        color: #27292d;
        background-color: white;
        border-radius: 10px;
        user-select: none;
        cursor: pointer;
        transition: all 0.2s ease-in-out;

        :hover {
            background-color: hsl(0, 0%, 90%);
        }

        :active {
            background-color: hsl(0, 0%, 70%);
        }

        & > span {
            font-size: 50px;
        }
    `,
    ConnectShareKeyBox: styled.div`
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;

        input {
            height: 20px;
            color: ${COLORS.SUB_COLOR};
            background-color: transparent;
            border: 2px solid ${COLORS.SUB_COLOR};
            border-radius: 5px;

            :focus {
                outline: none;
            }
        }

        div {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 10px;
            height: 30px;
            width: 100%;
            color: ${COLORS.MAIN_COLOR};
            background-color: ${COLORS.SUB_COLOR};
            border-radius: 5px;
            transition: all 0.2s ease-in-out;

            :hover {
                opacity: 0.8;
            }

            :active {
                opacity: 0.4;
            }
        }
    `,
};
