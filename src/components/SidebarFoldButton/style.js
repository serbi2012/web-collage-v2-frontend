import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 15vh;
        padding: 5px;
        bottom: 20px;
        height: 45px;
        width: 45px;
        color: ${(props) => (props.isFold ? COLORS.SUB_COLOR : COLORS.MAIN_COLOR)};
        background-color: ${(props) => (props.isFold ? COLORS.MAIN_COLOR : COLORS.SUB_COLOR)};
        border-radius: 10px;
        transform: ${(props) => (props.isFold ? "translateX(100px)" : "translateX(0px)")};
        user-select: none;
        cursor: pointer;
        transition: all 0.3s ease-in-out;

        :hover {
            background-color: hsl(0, 0%, 80%);
        }

        span {
            font-size: 30px;
            transform: ${(props) => (props.isFold ? "rotate(0deg)" : "rotate(180deg)")};
        }
    `,
};
