/**
 * Kauai codec decompression tests
 **/
#include <gtest/gtest.h>
#include <cstdint>

#include "util.h"
ASSERTNAME

TEST(KauaiCodecTests, DecodeKCDC)
{
    uint8_t rgbEncoded[44] = {0x4B, 0x43, 0x44, 0x43, 0x00, 0x00, 0x00, 0x24, 0x00, 0xA6, 0xA0, 0x29, 0x03, 0x62, 0x4E,
                              0x19, 0x36, 0x6C, 0xE6, 0x2A, 0x22, 0xCC, 0x5C, 0x8C, 0x92, 0x12, 0x93, 0x07, 0x04, 0x5D,
                              0xD6, 0x08, 0x8A, 0x37, 0x72, 0xCA, 0xB8, 0xFC, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

    const char *szExpected = "She sells seashells by the seashore.";

    KCDC kcdc;
    CODM codm(&kcdc, kcfmtKauai2);

    uint8_t rgbDecoded[128];
    long cbDecoded = SIZEOF(rgbDecoded);

    ASSERT_TRUE(codm.FDecompress(rgbEncoded, SIZEOF(rgbEncoded), rgbDecoded, cbDecoded, &cbDecoded));
    ASSERT_EQ(cbDecoded, 36);
    ASSERT_TRUE(FcmpCompareRgb(rgbDecoded, szExpected, cbDecoded)) << "Decoded data does not match expected value";
}

TEST(KauaiCodecTests, DecodeKCD2)
{
    uint8_t rgbEncoded[44] = {0x4B, 0x43, 0x44, 0x32, 0x00, 0x00, 0x00, 0x24, 0x00, 0x17, 0x53, 0x68, 0x65, 0x20, 0x73,
                              0x65, 0x6C, 0x6C, 0x73, 0xA9, 0x88, 0x61, 0x39, 0x31, 0x2D, 0x19, 0xE8, 0x62, 0x79, 0x20,
                              0x46, 0x56, 0x82, 0x06, 0x6F, 0x72, 0x65, 0x97, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

    const char *szExpected = "She sells seashells by the seashore.";

    KCDC kcdc;
    CODM codm(&kcdc, kcfmtKauai2);

    uint8_t rgbDecoded[128];
    long cbDecoded = SIZEOF(rgbDecoded);

    ASSERT_TRUE(codm.FDecompress(rgbEncoded, SIZEOF(rgbEncoded), rgbDecoded, cbDecoded, &cbDecoded));
    ASSERT_EQ(cbDecoded, 36);
    ASSERT_TRUE(FcmpCompareRgb(rgbDecoded, szExpected, cbDecoded)) << "Decoded data does not match expected value";
}