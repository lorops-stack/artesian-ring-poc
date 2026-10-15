#pragma once
#include <stdarg.h>
#include <stdio.h>
#include <stddef.h>

namespace app {
class BoundedWriter {
 public:
  BoundedWriter(char* out, size_t capacity) : out_(out), cap_(capacity) { if (cap_) out_[0] = 0; }
  bool append(const char* fmt, ...) {
    if (!cap_ || pos_ >= cap_) { truncated_ = true; return false; }
    va_list ap; va_start(ap, fmt);
    int wanted = vsnprintf(out_ + pos_, cap_ - pos_, fmt, ap);
    va_end(ap);
    if (wanted < 0) { truncated_ = true; out_[cap_ - 1] = 0; return false; }
    size_t remaining = cap_ - pos_;
    if ((size_t)wanted >= remaining) { pos_ = cap_ - 1; out_[pos_] = 0; truncated_ = true; return false; }
    pos_ += (size_t)wanted; return true;
  }
  size_t size() const { return pos_; }
  bool truncated() const { return truncated_; }
 private:
  char* out_; size_t cap_; size_t pos_ = 0; bool truncated_ = false;
};
}
