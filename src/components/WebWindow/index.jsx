import axios from "axios";
import React, { useRef } from "react";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { SERVER_ADDRESS } from "../../../utils/env";
import isMouseOn from "../../../utils/isMouseOn";
import { getCookie, deleteCookie } from "../../../utils/manageCookie";
import manipulateDom from "../../../utils/manipulateDom";
import AddressBarBox from "../AddressBar";
import { S } from "./style";
import { shareKeyState, urlAddressState } from "../../recoil/atoms";
import { useRecoilState } from "recoil";

const WebWindow = () => {
    const blockRef = useRef(null);
    const webWindowRef = useRef(null);
    const isScrapModeRef = useRef(false);
    const socketRef = useRef(null);
    const shareKeyRef = useRef(null);

    const [shareKey] = useRecoilState(shareKeyState);
    const [urlAddress, setUrlAddress] = useRecoilState(urlAddressState);

    const [webContainerDom, setWebContainerDom] = useState(null);
    const [selectedBlock, setSelectedBlock] = useState(null);
    const [isAddressBarFold, setIsAddressBarFold] = useState(true);
    const [isScrapMode, setIsScrapMode] = useState(false);

    useEffect(() => {
        isScrapModeRef.current = isScrapMode;
    }, [isScrapMode]);

    useEffect(() => {
        shareKeyRef.current = shareKey;
    }, [shareKey]);

    useEffect(() => {
        const webWindow = webWindowRef.current;
        const block = blockRef.current;
        const webWindowContent = document.getElementById("webWindowContent");

        let dragging = false;
        let selectedElement;

        const webWindowContentMouseover = (event) => {
            if (!isScrapModeRef.current) return;

            event.target.classList.add("selectedDom");
        };

        const webWindowContentMouseout = (event) => {
            if (!isScrapModeRef.current) return;

            event.target.classList.remove("selectedDom");
        };

        const webWindowMousedown = (event) => {
            if (!isScrapModeRef.current) return;

            dragging = true;
            selectedElement = event.target;

            block.style.display = "flex";
            block.style.position = "absolute";
            block.style.zIndex = "1000000";

            setSelectedBlock(selectedElement.outerHTML);

            block.style.top = `${event.clientY}px`;
            block.style.left = `${event.clientX}px`;
        };

        const windowMousemove = (event) => {
            if (!isScrapModeRef.current) return;
            if (!dragging) return;

            block.style.top = `${event.clientY}px`;
            block.style.left = `${event.clientX}px`;
        };

        const windowMouseup = (event) => {
            if (!isScrapModeRef.current) return;
            if (!dragging) return;

            const boxes = document.getElementsByClassName("BoxComponent");
            const scrapWindow = document.getElementById("scrapWindowContentBox");
            const copiedBox = boxes[0].cloneNode(false);

            dragging = false;

            block.style.top = `${event.clientY}px`;
            block.style.left = `${event.clientX}px`;

            for (let i = 0; i < boxes.length; i++) {
                if (isMouseOn(boxes[i])) {
                    selectedElement.style.position = "relative";
                    selectedElement.style.removeProperty("top");
                    selectedElement.style.removeProperty("left");
                    boxes[i].insertAdjacentElement("beforeend", selectedElement.cloneNode(true));

                    block.style.display = "none";

                    socketRef.current.emit("shareScrapContent", {
                        scrapContent: scrapWindow.innerHTML,
                        shareKey: shareKeyRef.current,
                    });

                    return;
                }
            }

            if (webWindow.getBoundingClientRect().left > event.clientX) {
                selectedElement.style.position = "relative";
                selectedElement.style.removeProperty("top");
                selectedElement.style.removeProperty("left");
                copiedBox.insertAdjacentElement("beforeend", selectedElement.cloneNode(true));

                scrapWindow.insertAdjacentElement("beforeend", copiedBox);
            }

            block.style.display = "none";

            socketRef.current.emit("shareScrapContent", {
                scrapContent: scrapWindow.innerHTML,
                shareKey: shareKeyRef.current,
            });
        };

        socketRef.current = io.connect(`${SERVER_ADDRESS}`);

        webWindowContent.addEventListener("mouseover", webWindowContentMouseover);
        webWindowContent.addEventListener("mouseout", webWindowContentMouseout);
        webWindow.addEventListener("mousedown", webWindowMousedown);
        window.addEventListener("mousemove", windowMousemove);
        window.addEventListener("mouseup", windowMouseup);

        (async () => {
            let url;

            if (getCookie("shareModeKey")) {
                const scrapContent = await axios.get(`${SERVER_ADDRESS}/scrapContent/${getCookie("shareModeKey")}/`);

                url = scrapContent.data.scrapContent.urlAddress;
            } else {
                url = getCookie("urlAddress") || urlAddress || "https://illuminating-extol-innovation.w3spaces.com/";
            }

            const sourceDomain = url.slice(`https://`.length).split("/").shift();
            const { data } = await axios.get(url);
            const htmlString = manipulateDom(data, sourceDomain);

            setUrlAddress(url);

            if (getCookie("urlAddress")) {
                deleteCookie("urlAddress");
            }

            setWebContainerDom(htmlString);
        })();

        return () => {
            webWindowContent.removeEventListener("mouseover", webWindowContentMouseover);
            webWindowContent.removeEventListener("mouseout", webWindowContentMouseout);
            webWindow.removeEventListener("mousedown", webWindowMousedown);
            window.removeEventListener("mousemove", windowMousemove);
            window.removeEventListener("mouseup", windowMouseup);
        };
    }, [urlAddress]);

    return (
        <S.MainWrapper id="webWindow" data-testid="webWindow" ref={webWindowRef}>
            <div
                id="selectedBlock"
                ref={blockRef}
                style={{ position: "absolute" }}
                dangerouslySetInnerHTML={{ __html: selectedBlock }}
            />
            <AddressBarBox
                data-testid="addressBarBox"
                isAddressBarFold={isAddressBarFold}
                setIsAddressBarFold={setIsAddressBarFold}
                setWebContainerDom={setWebContainerDom}
            />
            <S.ScrapModeButton
                className={`${isScrapMode && "scrapMode"}`}
                onClick={() => {
                    setIsScrapMode(!isScrapMode);
                }}
            >
                <span className="material-symbols-outlined">file_copy</span>
            </S.ScrapModeButton>
            <S.WebContainer id="webWindowContent" dangerouslySetInnerHTML={{ __html: webContainerDom }} />
        </S.MainWrapper>
    );
};

export default WebWindow;
