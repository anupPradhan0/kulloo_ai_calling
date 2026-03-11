# Install Drachtio server

If you see **`bash: command not found: drachtio`**, build and install the Drachtio server from source. Drachtio uses **autotools** (not CMake at the top level).

---

## Arch Linux

**1. Install build dependencies (including Boost)**

```bash
sudo pacman -S --needed base-devel cmake openssl zlib boost curl
```

**2. Clone, build, and install**

```bash
cd /tmp
git clone --depth=50 --branch=main https://github.com/drachtio/drachtio-server.git
cd drachtio-server
git submodule update --init --recursive
./autogen.sh
mkdir build && cd build
../configure CPPFLAGS='-DNDEBUG'
make -j$(nproc)
sudo make install
```

**3. Check**

```bash
which drachtio
# Should print: /usr/local/bin/drachtio
```

**4. Run from your sip project**

```bash
cd /home/mors/Code/sip
drachtio -f drachtio.conf.xml
```

### If hiredis build fails with a CMake version error

Newer CMake may reject the hiredis submodule’s minimum version. Edit the file and bump the minimum:

```bash
# In the drachtio-server repo (e.g. /tmp/drachtio-server)
sed -i 's/CMAKE_MINIMUM_REQUIRED(VERSION 3.0.0)/CMAKE_MINIMUM_REQUIRED(VERSION 3.5)/' deps/hiredis/CMakeLists.txt
```

Then run `make -j$(nproc)` again from the `build` directory.

---

## Ubuntu / Debian

**1. Install build dependencies**

```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake libssl-dev zlib1g-dev libcurl4-openssl-dev libboost-all-dev
```

**2. Clone, build, and install**

```bash
cd /tmp
git clone --depth=50 --branch=main https://github.com/drachtio/drachtio-server.git
cd drachtio-server
git submodule update --init --recursive
./autogen.sh
mkdir build && cd build
../configure CPPFLAGS='-DNDEBUG'
make -j$(nproc)
sudo make install
```

**3. Check and run**

```bash
which drachtio
cd /home/mors/Code/sip
drachtio -f drachtio.conf.xml
```

---

## If something fails

- **Boost errors** (e.g. `boost/log/common.hpp: No such file or directory`): Install Boost (Arch: `sudo pacman -S boost`; Ubuntu: `libboost-all-dev` in the apt line above).
- **hiredis CMake error:** Apply the `sed` fix in the “If hiredis build fails” section above.
- **Other build errors:** See [drachtio-server issues](https://github.com/drachtio/drachtio-server/issues).
