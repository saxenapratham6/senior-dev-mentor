package main

import (
	"fmt"
	"net/http"

	"example.com/shortener/internal/store"
)

func main() {
	s := store.New()
	http.HandleFunc("/shorten", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, s.Add(r.URL.Query().Get("url")))
	})
	http.ListenAndServe(":8080", nil)
}
