namespace Hrm.Api.Attributes;

/// <summary>
/// Maps to permission code e.g. employee.create — used for auto-discovery into permissions catalog.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public sealed class PermissionAttribute : Attribute
{
    public PermissionAttribute(string code) => Code = code;
    public string Code { get; }
}
