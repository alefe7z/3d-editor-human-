// SPDX-License-Identifier: GPL-3.0-or-later
package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

//go:embed site
var assets embed.FS

func main() {
	port := flag.Int("port", 0, "local HTTP port (0 chooses a free port)")
	noBrowser := flag.Bool("no-browser", false, "print the URL without opening a browser")
	flag.Parse()

	site, err := fs.Sub(assets, "site")
	if err != nil {
		log.Fatal(err)
	}
	listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()

	url := "http://" + listener.Addr().String() + "/?lang=en"
	fmt.Println("CharacterCreator:", url)
	fmt.Println("Keep this window open while using the editor. Press Ctrl+C to stop.")
	if !*noBrowser {
		command := exec.Command("xdg-open", url)
		switch runtime.GOOS {
		case "windows":
			command = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url)
		case "darwin":
			command = exec.Command("open", url)
		}
		if err := command.Start(); err != nil {
			log.Print("Open the address above in a WebGL 2 browser: ", err)
		} else {
			go func() { _ = command.Wait() }()
		}
	}

	server := &http.Server{
		Handler:           http.FileServer(http.FS(site)),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Fatal(server.Serve(listener))
}
