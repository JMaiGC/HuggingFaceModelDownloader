package hfdownloadernested

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"

	"github.com/cheggaaa/pb/v3"
)

const (
	RawFileURL      = "https://huggingface.co/%s/raw/%s/%s"
	LfsResolverURL  = "https://huggingface.co/%s/resolve/%s/%s"
	JsonFileTreeURL = "https://huggingface.co/api/models/%s/tree/%s/%s"
)

type hfmodel struct {
	Type        string `json:"type"`
	Oid         string `json:"oid"`
	Size        int    `json:"size"`
	Path        string `json:"path"`
	IsDirectory bool
	IsLFS       bool

	AppendedPath    string
	SkipDownloading bool
	DownloadLink    string
	Lfs             *hflfs `json:"lfs,omitempty"`
}

type hflfs struct {
	Oid_SHA265  string `json:"oid"` // in lfs, oid is sha256 of the file
	Size        int64  `json:"size"`
	PointerSize int    `json:"pointerSize"`
}

func DownloadModel(ModelName string, DestintionBasePath string, ModelBranch string) error {
	modelPath := path.Join(DestintionBasePath, strings.Replace(ModelName, "/", "_", -1))
	//Check StoragePath
	err := os.MkdirAll(modelPath, os.ModePerm)
	if err != nil {
		// fmt.Println("Error:", err)
		return err
	}
	//get root path files and folders
	err = processHFFolderTree(DestintionBasePath, ModelName, ModelBranch, "") // passing empty as foldername, because its the first root folder
	if err != nil {
		// fmt.Println("Error:", err)
		return err
	}
	return nil
}
func processHFFolderTree(DestintionBasePath string, ModelName string, ModelBranch string, fodlerName string) error {
	modelPath := path.Join(DestintionBasePath, strings.Replace(ModelName, "/", "_", -1))
	branch := ModelBranch
	JsonFileListURL := fmt.Sprintf(JsonFileTreeURL, ModelName, branch, fodlerName)
	fmt.Printf("Getting File Download Files List Tree from: %s\n", JsonFileListURL)
	response, err := http.Get(JsonFileListURL)
	if err != nil {
		// fmt.Println("Error:", err)
		return err
	}
	defer response.Body.Close()

	// Read the response body into a byte slice
	content, err := ioutil.ReadAll(response.Body)
	if err != nil {
		// fmt.Println("Error:", err)
		return err
	}
	// fmt.Println(string(content))
	jsonFilesList := []hfmodel{}
	err = json.Unmarshal(content, &jsonFilesList)
	if err != nil {
		return err
	}
	for i := range jsonFilesList {
		jsonFilesList[i].AppendedPath = path.Join(modelPath, jsonFilesList[i].Path)
		if jsonFilesList[i].Type == "directory" {
			jsonFilesList[i].IsDirectory = true
			err := os.MkdirAll(path.Join(modelPath, jsonFilesList[i].Path), os.ModePerm)
			if err != nil {
				return err
			}
			jsonFilesList[i].SkipDownloading = true
			//now if this a folder, this whole function will be called again recursivley
			processHFFolderTree(DestintionBasePath, ModelName, ModelBranch, jsonFilesList[i].Path) //recursive call
			continue
		}
		jsonFilesList[i].DownloadLink = fmt.Sprintf(RawFileURL, ModelName, branch, jsonFilesList[i].Path)
		if jsonFilesList[i].Lfs != nil {
			jsonFilesList[i].IsLFS = true
			resolverURL := fmt.Sprintf(LfsResolverURL, ModelName, branch, jsonFilesList[i].Path)
			getLink, err := getRedirectLink(resolverURL)
			if err != nil {
				return err
			}
			jsonFilesList[i].DownloadLink = getLink
		}
	}
	// UNCOMMENT BELOW TWO LINES TO DEBUG THIS FOLDER JSON STRUCTURE
	// s, _ := json.MarshalIndent(jsonFilesList, "", "  ")
	// fmt.Println(string(s))
	//2nd loop through the files, checking exists/non-exists
	for i := range jsonFilesList {
		//check if the file exists before
		// Check if the file exists
		if jsonFilesList[i].IsDirectory {
			continue
		}
		filename := jsonFilesList[i].AppendedPath
		if _, err := os.Stat(filename); err == nil {
			// File exists, get its size
			fileInfo, _ := os.Stat(filename)
			size := fileInfo.Size()
			fmt.Printf("Checking Existsing file: %s\n", jsonFilesList[i].AppendedPath)
			//  for non-lfs files, I can only compare size, I don't there is a sha256 hash for them
			if size == int64(jsonFilesList[i].Size) {
				jsonFilesList[i].SkipDownloading = true
				if jsonFilesList[i].IsLFS {
					err := verifyChecksum(jsonFilesList[i].AppendedPath, jsonFilesList[i].Lfs.Oid_SHA265)
					if err != nil {
						err := os.Remove(jsonFilesList[i].AppendedPath)
						if err != nil {
							return err
						}
						//jsonFilesList[i].SkipDownloading = false
					}
					fmt.Printf("Hash Matched for LFS file: %s\n", jsonFilesList[i].AppendedPath)
				}
			}

		}

	}
	//3ed loop through the files, downloading missing/failed files
	for i := range jsonFilesList {
		if jsonFilesList[i].IsDirectory {
			continue
		}
		if jsonFilesList[i].SkipDownloading {
			fmt.Printf("Skipping: %s\n", jsonFilesList[i].AppendedPath)
			continue
		}
		// fmt.Printf("Downloading: %s\n", jsonFilesList[i].Path)
		if jsonFilesList[i].IsLFS {
			downloadFile(jsonFilesList[i].DownloadLink, jsonFilesList[i].AppendedPath, jsonFilesList[i].Lfs.Oid_SHA265)
		} else {
			downloadFile(jsonFilesList[i].DownloadLink, jsonFilesList[i].AppendedPath, "") //no checksum available for small non-lfs files
		}
	}
	return nil
}

// ******************************************************************   All the functions below generated by ChatGPT 3.5, and ChatGPT 4 *********************************************************************
func IsValidModelName(modelName string) bool {
	pattern := `^[A-Za-z0-9_\-]+/[A-Za-z0-9_\-]+$`
	match, _ := regexp.MatchString(pattern, modelName)
	return match
}

func getRedirectLink(url string) (string, error) {
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode <= 399 {
		redirectURL := resp.Header.Get("Location")
		return redirectURL, nil
	}

	return "", fmt.Errorf("No redirect found")
}
func downloadFile(url string, filepath string, checksum string) error {
	// Create the file with .tmp extension, so if the download fails, the file won't exist.
	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	// return nil // uncomment this if you want just to test out the creation of files and folders
	// Get the data from the URL
	resp, err := http.Get(url)
	if err != nil {
		out.Close()
		return err
	}
	defer resp.Body.Close()

	// Create a progress bar
	bar := pb.Full.Start64(resp.ContentLength)
	bar.Set("prefix", path.Base(filepath)+" ")
	barReader := bar.NewProxyReader(resp.Body)

	// Write the body to file
	_, err = io.Copy(out, barReader)

	out.Close()
	if err != nil {
		return err
	}

	// The progress bar needs to be finished explicitly
	bar.Finish()
	if checksum != "" { //in case its lfs file, we are passing this
		err = verifyChecksum(filepath, checksum)
		if err != nil {
			fmt.Println(err)
			return err
		}
	}

	return nil
}
func verifyChecksum(fileName string, expectedChecksum string) error {
	file, err := os.Open(fileName)
	if err != nil {
		return err
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return err
	}

	sum := hasher.Sum(nil)
	if hex.EncodeToString(sum) != expectedChecksum {
		return fmt.Errorf("checksums do not match")
	}

	return nil
}