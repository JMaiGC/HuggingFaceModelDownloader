package main

import (
	hfd "hfdownloader/hfdownloader"
	"io"
	"net/http"
	"os"
)

func main() {
	modelName := os.Args[1]
	hfd.DownloadModel(modelName, "Models")

}

//To get this link, do the following

// https://huggingface.co/TheBloke/guanaco-65B-GPTQ/resolve/main/Guanaco-65B-GPTQ-4bit.act-order.safetensors

//this will redirect you to the correct cdn

// https://cdn-lfs.huggingface.co/repos/f4/1b/f41b6da10e9f81848d6394a26dd7b06b1cf120798f40833bcb109ea23d6febdd/df703858c425f68224d46d40583c21f3db470d789de282974b37c8d00e193874?response-content-disposition=attachment%3B+filename*%3DUTF-8%27%27Guanaco-65B-GPTQ-4bit.act-order.safetensors%3B+filename%3D%22Guanaco-65B-GPTQ-4bit.act-order.safetensors%22%3B&Expires=1687663378&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9jZG4tbGZzLmh1Z2dpbmdmYWNlLmNvL3JlcG9zL2Y0LzFiL2Y0MWI2ZGExMGU5ZjgxODQ4ZDYzOTRhMjZkZDdiMDZiMWNmMTIwNzk4ZjQwODMzYmNiMTA5ZWEyM2Q2ZmViZGQvZGY3MDM4NThjNDI1ZjY4MjI0ZDQ2ZDQwNTgzYzIxZjNkYjQ3MGQ3ODlkZTI4Mjk3NGIzN2M4ZDAwZTE5Mzg3ND9yZXNwb25zZS1jb250ZW50LWRpc3Bvc2l0aW9uPSoiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE2ODc2NjMzNzh9fX1dfQ__&Signature=MsgYctr4MO3Sst8OsLrWyuJJFiTaaiYBuXvM7nSQR-vbJCFWluxUEPCzwg8cJRSgyAGP6MP8qMqUfKA4lXlm7O7Im94c5J-WoJUW5MfFcEL4EK2Wyj%7EZAAf0RZh1N-HkWweIRX4IraOkjjkz0bMYq%7ESVGBhMBXogJzMAbsU%7EiFJG6oD-HAWDlPLpusicJjXNm67ZfN5pIpxN9RRvrYl%7EDJSu0xdpE8GrS3yB66RCFG%7E9ZA44V7XMM6XV-7QtDb44K4RlinalNLeD5kndf5cqanjMU9BvanmmrCx2DW9JaeevTNLWdfFbEjQXGEW0Qh3P3f22CFtflat2mb7sTwyHDg__&Key-Pair-Id=KVTP0A1DKRTAX
// DownloadFile downloads a URL to a local file. It's efficient because it streams
// the download and writes to the file as the download progresses. That means
// the program doesn't need to load the whole file into memory.
func DownloadFile(filepath string, url string) error {

	// Create the file, but give it a tmp file extension. This means we won't overwrite
	// a file until it's downloaded fully.
	out, err := os.Create(filepath + ".tmp")
	if err != nil {
		return err
	}
	defer out.Close()

	// Get the data.
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Write the body to file.
	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return err
	}

	// The file download is done. No errors. Now rename the tmp file to the original file.
	err = os.Rename(filepath+".tmp", filepath)
	if err != nil {
		return err
	}

	return nil
}
