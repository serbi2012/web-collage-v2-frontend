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
        top: 25vh;
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
    SelectPenBox: styled.div`
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 20px;
        width: 230px;
    `,
    DrawingOptionBox: styled.div`
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        margin: 30px 0;
    `,
    DrawingOption: styled.div`
        display: flex;
        justify-content: space-around;
        align-items: center;
        width: 200px;

        p {
            width: 80px;
            text-align: center;
        }

        input {
            width: 120px;
        }
    `,
};
