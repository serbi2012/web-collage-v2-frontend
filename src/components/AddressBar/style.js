import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        display: flex;
        justify-content: center;
        align-items: center;
        position: absolute;
        width: 250px;
        top: 10px;
        background-color: ${COLORS.SUB_COLOR};
        border-radius: 5px;
        box-shadow: 1px 2px 3px 0px rgba(0, 0, 0, 0.2);
        transition: all 0.4s ease-in-out;
        z-index: 2000000;

        form {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 5px 5px;
            width: 250px;

            input {
                padding: 5px 10px;
                width: 250px;
                border-radius: 5px;

                :focus {
                    outline: none;
                }
            }
        }
    `,
    ChangeUrlButton: styled.span`
        display: flex;
        justify-content: center;
        align-items: center;
        margin-left: 5px;
        height: 30px;
        width: 40px;
        color: ${COLORS.SUB_COLOR};
        background-color: ${COLORS.MAIN_COLOR};
        border-radius: 5px;
        transition: all 0.2s ease-in-out;
        user-select: none;
        cursor: pointer;

        :hover {
            opacity: 0.9;
        }

        :active {
            opacity: 0.7;
        }
    `,
    FoldButton: styled.div`
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        background-color: ${COLORS.SUB_COLOR};
        height: 60px;
        width: 50px;
        color: ${COLORS.MAIN_COLOR};
        border-radius: 50px;
        box-shadow: 1px 2px 3px 0px rgba(0, 0, 0, 0.2);
        ${({ isAddressBarFold }) => isAddressBarFold && `height: 100%;`};
        user-select: none;
        cursor: pointer;
        transition: all 0.4s ease-in-out;
        z-index: -1;

        :hover {
            opacity: 0.9;
        }

        :active {
            opacity: 0.7;
        }
    `,
};
