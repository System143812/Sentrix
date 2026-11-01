Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$role = if ($env:SENTRIX_BROADCAST_ROLE) { $env:SENTRIX_BROADCAST_ROLE } else { "Network Admin" }
$msg = if ($env:SENTRIX_BROADCAST_MSG) { $env:SENTRIX_BROADCAST_MSG } else { "Notice from Sentrix." }

$safeRole = [System.Security.SecurityElement]::Escape($role)
$safeMsg = [System.Security.SecurityElement]::Escape($msg)

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Broadcast Notice" Height="220" Width="400"
        WindowStartupLocation="CenterScreen" WindowStyle="None" AllowsTransparency="True" Background="Transparent" Topmost="True" ShowInTaskbar="True" Focusable="True">
    <Border Background="#ffffff" CornerRadius="8" BorderBrush="#d9e1ee" BorderThickness="1">
        <Grid Margin="16">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <!-- Title Bar with Role -->
            <TextBlock Grid.Row="0" Name="RoleText" Foreground="#172033" FontWeight="Bold" FontSize="15" VerticalAlignment="Center" Margin="0,0,0,10"/>

            <!-- Message Body -->
            <ScrollViewer Grid.Row="1" Margin="0,0,0,16" VerticalScrollBarVisibility="Auto">
                <TextBlock Text="$safeMsg" Foreground="#172033" FontSize="13" TextWrapping="Wrap" LineHeight="18"/>
            </ScrollViewer>

            <!-- Footer / Close Button -->
            <Button Grid.Row="2" Name="CloseButton" Content="Close" Background="#2563eb" Foreground="White" FontWeight="Bold" FontSize="13" Height="36" Width="100" HorizontalAlignment="Right" Cursor="Hand">
                <Button.Template>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" CornerRadius="6">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter Property="Background" Value="#1d4ed8"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Button.Template>
            </Button>
        </Grid>
    </Border>
</Window>
"@

try {
    $reader = (New-Object System.Xml.XmlNodeReader $xaml)
    $window = [Windows.Markup.XamlReader]::Load($reader)

    $roleText = $window.FindName("RoleText")
    if ($roleText) {
        $roleText.Text = $safeRole + ":"
    }

    $closeButton = $window.FindName("CloseButton")
    if ($closeButton) {
        $closeButton.Add_Click({
            $window.Close()
        })
    }

    $window.Add_MouseLeftButtonDown({
        try { $window.DragMove() } catch {}
    })

    $window.Add_Loaded({
        $window.Activate()
        $window.Topmost = $true
        $window.Focus()
    })

    [System.Media.SystemSounds]::Exclamation.Play()

    $window.ShowDialog() | Out-Null
    Write-Host "SUCCESS: WPF broadcast dialog displayed and closed."
    exit 0
} catch {
    Write-Host "ERROR: Failed to show WPF dialog: $_"
    exit 0
}
