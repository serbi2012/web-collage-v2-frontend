import axios from "axios";
import React, { useState } from "react";
import manipulateDom from "../../../utils/manipulateDom";
import { getCookie, deleteCookie } from "../../../utils/manageCookie";
import { useRecoilState } from "recoil";
import { urlAddressState } from "../../recoil/atoms";
import { S } from "./style";

const AddressBarBox = ({ isAddressBarFold, setIsAddressBarFold, setWebContainerDom }) => {
    const [urlAddress, setUrlAddress] = useRecoilState(urlAddressState);

    const [urlAddressInput, setUrlAddressInput] = useState("");

    const connectToUrlAddressOnClick = async (event) => {
        event.preventDefault();

        const sourceDomain = urlAddress.slice(`https://`.length).split("/").shift();

        const { data } = await axios.get(urlAddress);
        const htmlString = manipulateDom(data, sourceDomain);

        setUrlAddress(urlAddressInput);

        if (getCookie("urlAddress")) {
            deleteCookie("urlAddress");
        }

        setWebContainerDom(htmlString);
    };

    return (
        <S.MainWrapper
            style={{
                transform: isAddressBarFold ? "translateY(-65px)" : "translateY(15px)",
            }}
        >
            <form onSubmit={connectToUrlAddressOnClick}>
                <input
                    type="url"
                    data-testid="addressInput"
                    defaultValue={
                        getCookie("urlAddress") || urlAddress || "https://eye-catch-danke-foresight.w3spaces.com"
                    }
                    onChange={(event) => {
                        setUrlAddressInput(event.target.value);
                    }}
                />
                <S.ChangeUrlButton
                    data-testid="addressConnect"
                    className="material-symbols-outlined"
                    onClick={connectToUrlAddressOnClick}
                >
                    arrow_forward
                </S.ChangeUrlButton>
            </form>
            <S.FoldButton
                onClick={() => {
                    setIsAddressBarFold(!isAddressBarFold);
                }}
                isAddressBarFold={isAddressBarFold}
            >
                <span className="material-symbols-outlined">arrow_drop_up</span>
                <span className="material-symbols-outlined">arrow_drop_down</span>
            </S.FoldButton>
        </S.MainWrapper>
    );
};

export default AddressBarBox;
