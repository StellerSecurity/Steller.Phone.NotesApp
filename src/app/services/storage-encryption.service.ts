import {Injectable} from "@angular/core";
import {loadWrappedBundle, unwrapBundleWithPassword_WebCrypto} from "./crypto-key.service";

@Injectable({
    providedIn: 'root'
})
export class StorageEncryptionService {

    // default, password.
    private bundlePassword: string = "password";

    public getBundlePassword() {
        return this.bundlePassword;
    }

    public setBundlePassword(bundlePassword: string) {
        this.bundlePassword = bundlePassword;
    }

    public async getBundleJson() {
        const wrapped = await loadWrappedBundle();
        return await unwrapBundleWithPassword_WebCrypto(this.getBundlePassword(), wrapped);
    }

}