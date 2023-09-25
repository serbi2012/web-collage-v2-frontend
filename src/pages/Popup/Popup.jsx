/* eslint-disable no-undef */
import React, { useEffect, useState } from "react";
import { setCookie } from "../../../utils/manageCookie";
import { S } from "./style";

const Popup = () => {
    const [shareModeKey, setShareModeKey] = useState("");

    useEffect(() => {
        if (chrome) {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                const url = tabs[0].url;

                setCookie("urlAddress", url, 1);
            });
        }
    }, []);

    return (
        <S.MainWrapper>
            <S.Header>
                <h1>Web Collage</h1>
            </S.Header>
            <S.CollageButton
                onClick={() => {
                    window.open("main.html");
                }}
            >
                <span className="material-symbols-outlined">file_copy</span>
            </S.CollageButton>
            <h3>Scrap this page</h3>
            <hr />
            <h3>Enter shared page</h3>
            <S.ConnectShareKeyBox>
                <input
                    onChange={(event) => {
                        setShareModeKey(event.target.value);
                    }}
                />

                <div
                    onClick={() => {
                        setCookie("shareModeKey", shareModeKey, 1);
                        window.open("main.html");
                    }}
                >
                    Connect
                </div>
            </S.ConnectShareKeyBox>
        </S.MainWrapper>
    );
};

export default Popup;
