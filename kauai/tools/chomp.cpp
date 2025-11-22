/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    CHOMP.CPP
    Main routine for Chomp, the chunky compiler

***************************************************************************/
#include "chomp.h"
ASSERTNAME

/***************************************************************************
    Main routine for the stand-alone chunky compiler.  Returns non-zero
    iff there's an error.
***************************************************************************/
int main(int cpszs, char *prgpszs[])
{
    FNI fniSrc, fniDst;
    PCFL pcfl;
    STN stn;
    char *pszs;
    MSSIO mssioError(stderr);
    bool fCompile = fTrue;
    bool fSearchPath = fFalse;
    PSZS pszSearchPath = pvNil;

#ifdef UNICODE
    fprintf(stderr, "\nMicrosoft (R) Chunky File Compiler (Unicode; " Debug("Debug; ") __DATE__ "; " __TIME__ ")\n");
#else  //! UNICODE
    fprintf(stderr, "\nMicrosoft (R) Chunky File Compiler (Ansi; " Debug("Debug; ") __DATE__ "; " __TIME__ ")\n");
#endif //! UNICODE
    fprintf(stderr, "Copyright (C) Microsoft Corp 1995. All rights reserved.\n\n");

    for (prgpszs++; --cpszs > 0; prgpszs++)
    {
        pszs = *prgpszs;
        if (pszs[0] == '-' || pszs[0] == '/')
        {
            // option
            switch (pszs[1])
            {
            case 'c':
            case 'C':
                fCompile = fTrue;
                break;

            case 'd':
            case 'D':
                fCompile = fFalse;
                break;

            case 's':
            case 'S':
                fSearchPath = fTrue;
                break;

            default:
                fprintf(stderr, "Bad command line option\n\n");
                goto LUsage;
            }

            if (pszs[2] != 0)
            {
                fprintf(stderr, "Bad command line option\n\n");
                goto LUsage;
            }
            continue;
        }

        if (fSearchPath)
        {
            if (!fCompile)
            {
                fprintf(stderr, "Search path only valid when compiling\n\n");
                goto LUsage;
            }
            if (pszSearchPath != pvNil)
            {
                fprintf(stderr, "More than one search path specified\n\n");
                goto LUsage;
            }

            pszSearchPath = *prgpszs;
            fSearchPath = fFalse;
            continue;
        }

        if (fniDst.Ftg() != ftgNil)
        {
            fprintf(stderr, "Too many files specified\n\n");
            goto LUsage;
        }
        stn.SetSzs(pszs);
        if (!fniDst.FBuildFromPath(&stn))
        {
            fprintf(stderr, "Bad file name\n\n");
            goto LUsage;
        }
        if (fniSrc.Ftg() == ftgNil)
        {
            fniSrc = fniDst;
            fniDst.SetNil();
        }
    }

    if (fniSrc.Ftg() == ftgNil)
    {
        fprintf(stderr, "Missing source file name\n\n");
        goto LUsage;
    }

    if (fCompile)
    {
        CHCM chcm;

        if (fniDst.Ftg() == ftgNil)
        {
            fprintf(stderr, "Missing destination file name\n\n");
            goto LUsage;
        }

        if (pszSearchPath != pvNil)
        {
            STN stnSearchPath;
            stnSearchPath.SetSzs(pszSearchPath);
            if (!chcm.FSetSearchPath(stnSearchPath.Psz()))
            {
                fprintf(stderr, "Could not set search path\n\n");
                goto LUsage;
            }
        }

        pcfl = chcm.PcflCompile(&fniSrc, &fniDst, &mssioError);
        FIL::ShutDown();
        return pvNil == pcfl;
    }
    else
    {
        bool fRet;
        MSSIO mssioDump(stdout);
        MSFIL msfilDump;
        CHDC chdc;

        if (pvNil == (pcfl = CFL::PcflOpen(&fniSrc, fcflNil)))
        {
            fprintf(stderr, "Couldn't open source file as a chunky file\n\n");
            goto LUsage;
        }

        if (fniDst.Ftg() != ftgNil)
        {
            PFIL pfil;

            if (pvNil == (pfil = FIL::PfilCreate(&fniDst)))
            {
                fprintf(stderr, "Couldn't create destination file\n\n");
                FIL::ShutDown();
                return 1;
            }
            msfilDump.SetFile(pfil);
        }

        fRet = chdc.FDecompile(pcfl, fniDst.Ftg() == ftgNil ? (PMSNK)&mssioDump : (PMSNK)&msfilDump, &mssioError);
        ReleasePpo(&pcfl);
        FIL::ShutDown();
        return !fRet;
    }

    // print usage
LUsage:
    fprintf(stderr, "%s",
            "Usage:\n"
            "   chomp [/c] [/s <search-path>] <srcTextFile> <dstChunkFile>  - compile chunky file\n"
            "   chomp /d <srcChunkFile> [<dstTextFile>]  - decompile chunky file\n\n");

    FIL::ShutDown();
    return 1;
}

#ifdef DEBUG
bool _fEnableWarnings = fTrue;

/***************************************************************************
    Warning proc called by Warn() macro
***************************************************************************/
void WarnProc(PSZS pszsFile, int32_t lwLine, PSZS pszsMessage)
{
    if (_fEnableWarnings)
    {
        fprintf(stderr, "%s(%d) : warning", pszsFile, lwLine);
        if (pszsMessage != pvNil)
        {
            fprintf(stderr, ": %s", pszsMessage);
        }
        fprintf(stderr, "\n");
    }
}

/***************************************************************************
    Returning true breaks into the debugger.
***************************************************************************/
bool FAssertProc(PSZS pszsFile, int32_t lwLine, PSZS pszsMessage, void *pv, int32_t cb)
{
    fprintf(stderr, "An assert occurred: \n");
    if (pszsMessage != pvNil)
        fprintf(stderr, "   Message: %s\n", pszsMessage);
    if (pv != pvNil)
    {
        fprintf(stderr, "   Address %p\n", pv);
        if (cb != 0)
        {
            fprintf(stderr, "   Value: ");
            switch (cb)
            {
            default: {
                uint8_t *pb;
                uint8_t *pbLim;

                for (pb = (uint8_t *)pv, pbLim = pb + cb; pb < pbLim; pb++)
                    fprintf(stderr, "%02x", (int)*pb);
            }
            break;

            case 2:
                fprintf(stderr, "%04x", (int)*(int16_t *)pv);
                break;

            case 4:
                fprintf(stderr, "%08x", *(int32_t *)pv);
                break;
            }
            printf("\n");
        }
    }
    fprintf(stderr, "   File: %s\n", pszsFile);
    fprintf(stderr, "   Line: %d\n", lwLine);

    return fFalse;
}
#endif // DEBUG
