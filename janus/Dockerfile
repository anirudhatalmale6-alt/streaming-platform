FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    libmicrohttpd-dev \
    libjansson-dev \
    libssl-dev \
    libsofia-sip-ua-dev \
    libglib2.0-dev \
    libopus-dev \
    libogg-dev \
    libcurl4-openssl-dev \
    liblua5.3-dev \
    libconfig-dev \
    pkg-config \
    gengetopt \
    libtool \
    automake \
    cmake \
    meson \
    ninja-build \
    libnice-dev \
    libsrtp2-dev \
    libwebsockets-dev \
    libusrsctp-dev \
    libavutil-dev \
    libavcodec-dev \
    libavformat-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Build and install libnice (newer version)
WORKDIR /tmp
RUN git clone https://gitlab.freedesktop.org/libnice/libnice.git && \
    cd libnice && \
    meson --prefix=/usr build && \
    ninja -C build && \
    ninja -C build install

# Build Janus
WORKDIR /tmp
RUN git clone https://github.com/meetecho/janus-gateway.git && \
    cd janus-gateway && \
    sh autogen.sh && \
    ./configure --prefix=/opt/janus \
        --enable-websockets \
        --enable-post-processing \
        --enable-plugin-streaming \
        --enable-plugin-videoroom \
        --disable-plugin-echotest \
        --disable-plugin-recordplay \
        --disable-plugin-sip \
        --disable-plugin-nosip \
        --disable-plugin-videocall \
        --disable-plugin-textroom \
        --disable-plugin-audiobridge \
        --disable-plugin-voicemail && \
    make && \
    make install && \
    make configs

# Copy configuration
COPY janus.jcfg /opt/janus/etc/janus/
COPY janus.plugin.streaming.jcfg /opt/janus/etc/janus/

EXPOSE 8088 8089 8188 8989 10000-10100/udp

WORKDIR /opt/janus

CMD ["/opt/janus/bin/janus", "-F", "/opt/janus/etc/janus"]
