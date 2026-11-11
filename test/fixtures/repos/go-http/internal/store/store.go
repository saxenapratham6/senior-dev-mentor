// Package store keeps short codes and the URLs they stand for, in memory.
package store

import "fmt"

type Store struct{ urls map[string]string }

func New() *Store { return &Store{urls: map[string]string{}} }

func (s *Store) Add(url string) string {
	code := fmt.Sprintf("%d", len(s.urls)+1)
	s.urls[code] = url
	return code
}
