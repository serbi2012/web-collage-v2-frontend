import React from "react";
import { render } from "react-dom";
import styled from "styled-components";
import Sidebar from "../../components/Sidebar";
import WebWindow from "../../components/WebWindow";
import ScrapWindow from "../../components/ScrapWindow";
import "./index.css";
import { RecoilRoot } from "recoil";

const MainContainer = styled.div`
    display: flex;
`;

const Main = () => {
    return (
        <RecoilRoot>
            <MainContainer>
                <Sidebar />
                <ScrapWindow />
                <WebWindow />
            </MainContainer>
        </RecoilRoot>
    );
};

render(<Main />, window.document.querySelector("#app-container"));

if (module.hot) module.hot.accept();
