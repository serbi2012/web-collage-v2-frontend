import styled from "styled-components";
import COLORS from "../../constants/COLORS";

export const S = {
    MainWrapper: styled.div`
        & > div {
            display: flex;
            justify-content: center;
            margin: 5px;
            padding: 5px 5px;
            height: 50px;
            width: 50px;
            background-color: ${COLORS.SUB_COLOR};
            border: 1px solid ${COLORS.MAIN_COLOR};
            border-radius: 5px;
            transition: all 0.2s ease-in-out;
            user-select: none;
            cursor: pointer;

            :hover {
                color: ${COLORS.SUB_COLOR};
                background-color: ${COLORS.MAIN_COLOR};

                .bigFigure,
                .smallFigure {
                    border: 2px solid ${COLORS.SUB_COLOR};
                }
            }

            :active {
                opacity: 0.4;
            }
        }

        .sortTop {
            align-items: flex-start;
        }

        .sortCenter {
            align-items: center;
        }

        .sortBottom {
            align-items: flex-end;
        }

        .rotate {
            transform: rotate(270deg);
        }
    `,
    BigFigure: styled.div`
        margin: 0 1px;
        height: 30px;
        width: 14px;
        border: 2px solid ${COLORS.MAIN_COLOR};
        border-radius: 2px;
    `,
    SmallFigure: styled.div`
        margin: 0 1px;
        height: 20px;
        width: 14px;
        border: 2px solid ${COLORS.MAIN_COLOR};
        border-radius: 2px;
    `,
};
