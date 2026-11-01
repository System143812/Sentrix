Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$role = if ($env:SENTRIX_BROADCAST_ROLE) { $env:SENTRIX_BROADCAST_ROLE } else { "Network Admin" }
$msg = if ($env:SENTRIX_BROADCAST_MSG) { $env:SENTRIX_BROADCAST_MSG } else { "Notice from Sentrix." }

$safeRole = [System.Security.SecurityElement]::Escape($role)
$safeMsg = [System.Security.SecurityElement]::Escape($msg)

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Broadcast Notice" Width="440" MinHeight="140" MaxHeight="350" SizeToContent="Height"
        WindowStartupLocation="CenterScreen" WindowStyle="None" AllowsTransparency="True" Background="Transparent" Topmost="True" ShowInTaskbar="True" Focusable="True" FontFamily="Segoe UI">
    <Border Background="#ffffff" CornerRadius="8" BorderBrush="#cbd5e1" BorderThickness="1">
        <Grid Margin="16">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <!-- Header Row: Icon Badge + Title ("Message from <Role>") -->
            <StackPanel Grid.Row="0" Orientation="Horizontal" VerticalAlignment="Center" Margin="0,0,0,12">
                <Border Width="32" Height="32" Margin="0,0,10,0" Background="#f8fafc" BorderBrush="#e2e8f0" BorderThickness="1" CornerRadius="6">
                    <TextBlock Text="i" Foreground="#0f172a" FontSize="15" FontWeight="Bold" FontFamily="Segoe UI" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                </Border>
                <TextBlock Name="RoleText" Foreground="#0f172a" FontWeight="Bold" FontSize="14" VerticalAlignment="Center"/>
            </StackPanel>

            <!-- Message Body -->
            <ScrollViewer Grid.Row="1" MaxHeight="220" Margin="0,0,0,16" VerticalScrollBarVisibility="Auto">
                <TextBlock Text="$safeMsg" Foreground="#334155" FontSize="13.5" TextWrapping="Wrap" LineHeight="20"/>
            </ScrollViewer>

            <!-- Footer / Close Button -->
            <Button Grid.Row="2" Name="CloseButton" Content="Close" Background="#0f172a" Foreground="White" FontWeight="Bold" FontSize="12" Height="32" Width="88" HorizontalAlignment="Right" Cursor="Hand">
                <Button.Template>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" CornerRadius="6">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter Property="Background" Value="#1e293b"/>
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
        $roleText.Text = "Message from " + $safeRole
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
