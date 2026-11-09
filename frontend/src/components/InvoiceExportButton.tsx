import {useState} from "react";
import {downloadInvoicesExcel, type InvoiceFilters} from "../lib/api/invoices";
import {useToast} from "../lib/toast";
import {errorMessage, logError} from "../lib/errors";
import {DownloadIcon} from "./icons";
import Button from "./ui/Button";

interface InvoiceExportButtonProps {
    propertyId: string;
    /** Set on a room's screen: only that room's bookings. */
    unitId?: string | null;
    range: InvoiceFilters;
    disabled?: boolean;
}

/** "Download Excel": every booking behind the totals on screen (all pages), with the same filters, as an .xlsx file. */
export default function InvoiceExportButton({propertyId, unitId = null, range, disabled}: InvoiceExportButtonProps) {
    const toast = useToast();
    const [downloading, setDownloading] = useState(false);

    async function download() {
        setDownloading(true);
        try {
            await downloadInvoicesExcel(propertyId, unitId, range);
        } catch (error) {
            logError(error, "Excel export");
            toast.show(errorMessage(error, "Couldn't download the Excel file."), {tone: "error"});
        } finally {
            setDownloading(false);
        }
    }

    return (
        <Button variant="secondary" size="sm" className="min-h-10" icon={<DownloadIcon size={18}/>}
                onClick={download} loading={downloading} disabled={disabled}>
            Download Excel
        </Button>
    );
}
