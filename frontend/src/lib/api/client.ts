import axios from "axios";
import { tokenStorage } from "../auth/tokenStorage";

export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
});

apiClient.interceptors.request.use((config) =>{
    const token = tokenStorage.get();
    if (token){
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

apiClient.interceptors.response.use(
    (response)=>response,
    (error) =>{
    if(error.response?.status === 401){
        tokenStorage.clear();
        window.location.href = "/login";
    }
    return Promise.reject(error);
}

)