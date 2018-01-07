# CCMINER

Place ccminer executable into this directory (and configure properly)

## Compile instructions for tpruvots version of ccminer on MacOS

First of all few things you need:

 - Latest XCode
 - Latest XCode supported by NVIDIA CUDA (8.33 at the time of writing)
 - NVidia WebDrivers, NVIDIA CUDA Drivers, NVIDIA CUDA Tookit supported by ccminer (9.0 at the time of writing)

## Preparation

- Install latest XCode and XCode command line tools

```
$ sudo xcode-select --install
```

- Copy XCode 8.33 into `/Applications` folder as `XCode_8_33.app`
- Install Homebrew

```
$ /usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
```

- Install required packages

```
$ brew install pkg-config autoconf automake curl openssl llvm
```

- Link OpenSSL libraries (it should be noted that this is a possible security risk, do it on your own volition)

```
$ ln -s /usr/local/opt/openssl/include/openssl /usr/local/include/.
```

- Install NVIDIA software (at which point you do this is not important) add following to your `.profile` (or equilevant) If needed update version

```
export PATH=$PATH:/Developer/NVIDIA/CUDA-9.0/bin
export DYLD_LIBRARY_PATH=$DYLD_LIBRARY_PATH:/Developer/NVIDIA/CUDA-9.0/lib
```

- Get the tpruvots repository `linux` branch

```
$ git clone -b linux https://github.com/tpruvot/ccminer.git
```

- Go into reposity folder and get `acinclude.m4`

```
$ curl https://source.jasig.org/cas-clients/mod_auth_cas/tags/mod_auth_cas-1.0.9.1/libcurl.m4 -o acinclude.m4
```

## Source file modifications

Following changes are required to compile ccminer succesfully.

Make these changes into `Makefile.am`:

Within HAVE_OSX
```
if HAVE_OSX
ccminer_CPPFLAGS += -I/usr/local/opt/llvm/include 
ccminer_CPPFLAGS += -I/usr/local/opt/openssl/include
ccminer_CPPFLAGS += -fopenmp
ccminer_CPPFLAGS += -lc++
ccminer_LDFLAGS += -L/usr/local/opt/llvm/lib
ccminer_LDFLAGS += -L/usr/local/opt/openssl/lib
ccminer_LDADD += -lomp
ccminer_LDFLAGS += -L/usr/local/opt/curl/lib
ccminer_CPPFLAGS += -I/usr/local/opt/curl/include
endif
```

Make these changes into `equi/eqcuda.hpp`

Comment out following lines:

```
#ifdef WIN32
#define rt_error std::runtime_error
#else
class rt_error : public std::runtime_error
{
public:
       explicit rt_error(const std::string& str) : std::runtime_error(str) {}
};
#endif
```

Replace all instances of `rt_error` with `std::runtime_error`

## Compiling ccminer

 - While compiling CUDA code you need to have XCode 8.33 enabled 
 ```
 $ sudo xcode-select --switch /Applications/Xcode_8_33.app/
 ```
 - Execute following before building:

```
export CC=/usr/local/opt/llvm/bin/clang
export CPP=/usr/local/opt/llvm/bin/clang-cpp
export CXX=/usr/local/opt/llvm/bin/clang++
```

These should not be required, but try it if build doesn't work:
```
LDFLAGS=-L/usr/local/opt/curl/lib
CPPFLAGS=-I/usr/local/opt/curl/include
LIBCURL_CFLAGS=-I/usr/local/opt/curl/include
LIBCURL_LIBS=-L/usr/local/opt/curl/lib
```

After this you should be able to compile ccminer within MacOS.

Start compile with `./build.sh` in the repository folder.
