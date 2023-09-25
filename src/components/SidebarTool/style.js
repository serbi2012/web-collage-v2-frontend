import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 1.5vh 0;
        padding: 5px;
        height: 45px;
        width: 45px;
        color: ${COLORS.SUB_COLOR};
        border: 3px solid transparent;
        border-radius: 10px;
        user-select: none;
        cursor: pointer;
        transition: all 0.3s ease-in-out;

        :hover {
            border: 3px solid white;
        }

        & > span {
            font-size: 30px;
        }
    `,
};
