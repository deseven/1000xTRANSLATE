# PowerShell version of 1000xTRANSLATE.bat

function Show-Menu {
    Clear-Host
    Write-Host "Please select an option:"
    Write-Host "1. Dump game resources"
    Write-Host "2. Translate"
    Write-Host "3. Check"
    Write-Host "4. Build translation"
    Write-Host "5. Clean up extracted and modified resources"
    Write-Host "6. Install internal dependencies"
    Write-Host "7. Validate config and dependencies"
    Write-Host "8. Exit"
    Write-Host ""
}

function Execute-Command {
    param (
        [string]$CommandName,
        [string]$NpmScript
    )
    
    Write-Host "Running 'npm run $NpmScript'..."
    npm run $NpmScript
    
    Write-Host "Operation completed."
    Read-Host -Prompt "Press Enter to continue"
}

# Main script loop
$exitRequested = $false

while (-not $exitRequested) {
    Show-Menu
    $choice = Read-Host -Prompt "Enter your choice (1-8)"
    
    switch ($choice) {
        "1" { Execute-Command -CommandName "Dump" -NpmScript "dump" }
        "2" { Execute-Command -CommandName "Translate" -NpmScript "translate" }
        "3" { Execute-Command -CommandName "Check" -NpmScript "check" }
        "4" { Execute-Command -CommandName "Build" -NpmScript "build" }
        "5" { Execute-Command -CommandName "Clean" -NpmScript "clean" }
        "6" { Execute-Command -CommandName "Init" -NpmScript "init" }
        "7" { Execute-Command -CommandName "Validate" -NpmScript "validate" }
        "8" { $exitRequested = $true }
        default {
            Write-Host "Invalid choice. Please try again."
            Read-Host -Prompt "Press Enter to continue"
        }
    }
}