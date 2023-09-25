import React from "react";
import { S } from "./style";
import { themeState } from "../../recoil/atoms";
import { useRecoilState } from "recoil";

const ThemeOption = ({ theme }) => {
    const [, setTheme] = useRecoilState(themeState);

    const changeThemeOnMouseDown = () => {
        const boxes = document.getElementsByClassName("BoxComponent");

        for (let i = 0; i < boxes.length; i++) {
            boxes[i].style.boxShadow = `0 0 0 2px ${theme.BOX_BORDER}`;
        }

        setTheme(`theme-${theme.NAME}`);
    };

    return (
        <S.MainWrapper
            data-testid="themeOption"
            style={{ backgroundColor: theme.BACKGROUND_COLOR }}
            onMouseDown={changeThemeOnMouseDown}
        />
    );
};

export default ThemeOption;
