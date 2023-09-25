import axios from "axios";
import React, { useEffect, useState } from "react";
import { SERVER_ADDRESS } from "../../../utils/env";
import { getCookie, deleteCookie } from "../../../utils/manageCookie";
import { isSidebarModalOpenState, selectedSidebarToolState, shareKeyState, urlAddressState } from "../../recoil/atoms";
import { useRecoilState } from "recoil";
import { S } from "./style";

const SidebarShareModeModal = () => {
    const [, setShareKey] = useRecoilState(shareKeyState);
    const [urlAddress, setUrlAddress] = useRecoilState(urlAddressState);
    const [selectedSidebarTool] = useRecoilState(selectedSidebarToolState);
    const [isSidebarModalOpen] = useRecoilState(isSidebarModalOpenState);

    const [keyInput, setKeyInput] = useState("");

    const createShareKeyOnClick = async () => {
        const scrapWindow = document.getElementById("scrapWindowContentBox");
        const copyKey = document.getElementById("shareKeyInput");

        const newScrapContent = await axios.post(`${SERVER_ADDRESS}/scrapContent/`, {
            content: scrapWindow.innerHTML,
            urlAddress,
        });

        copyKey.value = newScrapContent.data.id.toString();

        setShareKey(copyKey.value);
        copyKey.select();
        copyKey.setSelectionRange(0, 99999);
        document.execCommand("Copy");
        alert("Key가 성공적으로 생성되었습니다.");
        // copyUrlFnc();
    };

    const connectKeyOnClick = async () => {
        const scrapWindow = document.getElementById("scrapWindowContentBox");
        const scrapContent = await axios.get(`${SERVER_ADDRESS}/scrapContent/${keyInput}`);

        scrapWindow.innerHTML = scrapContent.data.scrapContent.content;

        setShareKey(keyInput);
        setUrlAddress(scrapContent.data.scrapContent.urlAddress);
    };

    useEffect(() => {
        (async () => {
            if (getCookie("shareModeKey")) {
                const scrapWindow = document.getElementById("scrapWindowContentBox");
                const scrapContent = await axios.get(`${SERVER_ADDRESS}/scrapContent/${getCookie("shareModeKey")}/`);

                scrapWindow.innerHTML = scrapContent.data.scrapContent.content;

                setShareKey(getCookie("shareModeKey"));
                setUrlAddress(scrapContent.data.scrapContent.urlAddress);
                deleteCookie("shareModeKey");
            }
        })();
    }, []);

    return (
        <S.MainWrapper
            style={{
                display: (selectedSidebarTool !== "shareMode" || !isSidebarModalOpen) && "none",
            }}
        >
            <h3>Share Mode</h3>
            <S.SidebarModeOption onClick={createShareKeyOnClick}>Create Key</S.SidebarModeOption>
            <input id="shareKeyInput" />
            <hr />
            <S.SidebarModeOption onClick={connectKeyOnClick}>Connect</S.SidebarModeOption>
            <input
                onChange={(event) => {
                    setKeyInput(event.target.value);
                }}
            />
        </S.MainWrapper>
    );
};

export default SidebarShareModeModal;
